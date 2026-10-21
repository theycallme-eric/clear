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
  const reportOutcome = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const api: BlockCompletionApi = { reportOutcome, isBlockRecorded: () => false }
  return { api, reportOutcome }
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
    const { api, reportOutcome } = completionDouble()
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


    // The acceptance criterion, in one assertion: the score including the
    // partial round, persisted at expiry.
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 480,
      roundsCompleted: 5,
      partialRoundReps: 8,
    })
  })

  it('omits the partial round when none was recorded', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    await addRound(user)
    clock = START + 300_000
    await user.click(screen.getByRole('button', { name: 'Finish early' }))

    // No `partialRoundReps` key at all: the column holds null, not a zero that
    // would read as "stopped on the boundary".
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 300,
      roundsCompleted: 1,
    })
  })

  it('sends a recorded zero as a zero', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    await addRound(user)
    clock = START + 300_000
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.click(screen.getByRole('button', { name: 'Partial round' }))

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 300,
      roundsCompleted: 1,
      partialRoundReps: 0,
    })
  })

  it('supplies zero rounds rather than nothing for an AMRAP that managed none', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    await start(user)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 0,
      roundsCompleted: 0,
    })
  })

  it('supplies nothing at all for an AMRAP that was never started', () => {
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock()
    renderAmrap(block, fakeStorage(), api)

    // Nothing ran, so nothing was observed — not even a zero (DATA_MODEL §8).
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('supplies no score at all for an AMRAP with nothing to perform', () => {
    const { api, reportOutcome } = completionDouble()
    const block = amrapBlock({ exercises: [] })
    renderAmrap(block, fakeStorage(), api)

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })
})

describe('the 0.14.3 card, timer and group grammar', () => {
  /** An AMRAP already `elapsedMs` into its window, as a refresh would find it. */
  async function resumeAt(elapsedMs: number, api = completionDouble().api) {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = amrapBlock()
    clock = START
    const first = renderAmrap(block, storage, api)
    await start(user)
    await addRound(user)
    first.unmount()

    clock = START + elapsedMs
    return { user, block, ...renderAmrap(block, storage, api) }
  }

  it('stands the countdown beside the block’s card, never inside one', async () => {
    const { container } = await resumeAt(60_000)

    const timer = screen.getByRole('timer', { name: 'Time remaining' })
    const timerCard = timer.closest('.clr-card')
    expect(timerCard).not.toBeNull()
    expect(timerCard?.parentElement?.closest('.clr-card')).toBeNull()

    // One timer card and one block card, and no card within either.
    expect(container.querySelectorAll('.clr-card')).toHaveLength(2)
    expect(container.querySelector('.clr-card .clr-card')).toBeNull()

    // The controls stay with the block, in its card rather than the timer's.
    const finish = screen.getByRole('button', { name: 'Finish early' })
    expect(finish.closest('.clr-card')).not.toBe(timerCard)
  })

  it('keeps the countdown a labelled timer that is not a live region', async () => {
    await resumeAt(60_000)

    const timer = screen.getByRole('timer', { name: 'Time remaining' })
    expect(timer).toHaveTextContent('07:00')
    for (let node: Element | null = timer; node !== null; node = node.parentElement) {
      expect(node).not.toHaveAttribute('aria-live')
    }
  })

  it('leaves urgency to the timer’s own low state, with nothing added around it', async () => {
    const calm = await resumeAt(60_000)
    const resting = screen.getByRole('timer')
    expect(resting).toHaveClass('clr-chamfer--timer')
    expect(resting.closest('.clr-bleed')).not.toHaveClass('clr-pulse-micro')
    calm.unmount()

    const { container } = await resumeAt(472_000)
    const low = screen.getByRole('timer', { name: 'Time remaining' })
    expect(low).toHaveTextContent('00:08')
    expect(low).toHaveClass('clr-chamfer--timer-low')

    // The package's stepped pulse on the timer's own emission — and that is the
    // only loop on the block.
    const bleed = low.closest('.clr-bleed')
    expect(bleed).toHaveClass('clr-pulse-micro')
    expect(bleed?.parentElement).toBe(container.firstElementChild)
    expect(container.querySelectorAll('.clr-pulse-micro')).toHaveLength(1)

    // Urgent, and still one tap to bank a round.
    expect(rounds()).toBe('1')
  })

  it('labels each group inside the card it belongs to', async () => {
    const { user } = await resumeAt(60_000)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))
    await user.click(screen.getByRole('button', { name: 'Partial round' }))

    const card = screen.getByRole('button', { name: 'Take back a round' }).closest('.clr-card')
    expect(card).not.toBeNull()

    for (const label of ['Rounds completed', 'Reps into the next round', 'Each round:']) {
      const heading = screen.getByRole('heading', { name: label })
      expect(heading.closest('.clr-card')).toBe(card)
    }
    for (const name of ['Rounds completed', 'Reps into the next round']) {
      expect(screen.getByRole('group', { name }).closest('.clr-card')).toBe(card)
    }
    expect(
      screen.getByRole('list', { name: 'Movements in this AMRAP' }).closest('.clr-card'),
    ).toBe(card)
  })

  it('draws the settled time as the shared bare readout, and says when the cap ended it', async () => {
    await resumeAt(600_000)

    const readout = screen.getByText('AMRAP complete').closest('.clr-metric-frame')
    expect(readout).not.toBeNull()
    // Inside a card the readout takes no frame of its own.
    expect(readout).not.toHaveClass('clr-chamfer')
    expect(within(readout as HTMLElement).getByText('08:00 on the clock')).toBeInTheDocument()
    expect(within(readout as HTMLElement).getByText('Cap reached')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('does not call an early finish a cap', async () => {
    const { user } = await resumeAt(323_000)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))

    expect(screen.getByText('05:23 on the clock')).toBeInTheDocument()
    expect(screen.queryByText('Cap reached')).not.toBeInTheDocument()
  })

  it('makes the partial-round toggles frameless text actions', async () => {
    const { user } = await resumeAt(60_000)
    await user.click(screen.getByRole('button', { name: 'Finish early' }))

    const open = screen.getByRole('button', { name: 'Partial round' })
    expect(open).toHaveClass('clr-text-action')
    expect(open).not.toHaveClass('clr-btn')

    await user.click(open)
    const close = screen.getByRole('button', { name: 'No partial round' })
    expect(close).toHaveClass('clr-text-action')
  })

  it('says a saved block is saved, and still shows the score', async () => {
    const reportOutcome = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
    await resumeAt(600_000, { reportOutcome, isBlockRecorded: () => true })

    expect(screen.getByText('Block saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()

    expect(rounds()).toBe('1')
    expect(screen.getByText('08:00 on the clock')).toBeInTheDocument()
  })

  it('says a block with nothing to perform in plain copy inside the one card', () => {
    const { container } = renderAmrap(
      amrapBlock({ exercises: [] }),
      fakeStorage(),
      completionDouble().api,
    )

    const message = screen.getByText(/every movement in it was swapped out/i)
    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(message.closest('.clr-card')).not.toBeNull()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('recovers from an unusable stored record without a timer or a score', () => {
    const storage = fakeStorage()
    storage.setItem(WORKOUT_AMRAP_STORAGE_KEY, 'not json')
    const { container } = renderAmrap(amrapBlock(), storage, completionDouble().api)

    expect(screen.getByRole('button', { name: 'Start AMRAP' })).toBeEnabled()
    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(screen.queryByText('AMRAP complete')).not.toBeInTheDocument()
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

    const { api, reportOutcome } = completionDouble()
    const shortened: BlockProgress = { ...block, timerSeconds: 240 }
    renderAmrap(shortened, storage, api)

    expect(screen.getByText('04:00 on the clock')).toBeInTheDocument()
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {
      elapsedSeconds: 240,
      roundsCompleted: 0,
    })
  })
})
