/**
 * EXE-03 acceptance, as the user meets it:
 *
 *   · the rounds and the shared rest come from `workout_blocks`;
 *   · the round and the position within it advance in one tap, and survive a
 *     refresh — here, a remount against the same storage;
 *   · the shared rest is taken once per round rather than once per exercise;
 *   · completion supplies `rounds_completed` to the shell.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { SetLoggingContext, type SetLoggingApi } from '../state/set-logging'
import type { BlockProgress } from '../state/workout-progress'
import { sessionProgress } from '../state/workout-progress'
import {
  readCircuitState,
  WORKOUT_CIRCUIT_STORAGE_KEY,
  type ShellStorage,
} from '../state/workout-persistence'
import { snapshotFixture, type BlockFixture } from '../test/workout-double'
import { CircuitBlock } from './circuit-block'

/** A moment the rest can be measured from, and a clock the test moves. */
const START = Date.parse('2026-09-24T10:00:00.000Z')
let clock = START
const now = () => clock

/** `localStorage`, in memory, so one test cannot see another's rounds. */
function fakeStorage(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

function circuitBlock(fixture: BlockFixture = {}): BlockProgress {
  const snapshot = snapshotFixture({
    sections: [
      {
        blocks: [
          {
            structureType: 'circuit',
            rounds: 3,
            roundRestSeconds: 60,
            exercises: ['not_started', 'not_started', 'not_started'],
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

/** EXE-02's seam, stubbed: this test is about rounds, not about sets. */
const setLogging: SetLoggingApi = {
  logSet: vi.fn(),
  loggedSets: () => [],
  isSaving: () => false,
  weightUnit: 'kg',
}

function renderCircuit(
  block: BlockProgress,
  storage: ShellStorage,
  api: BlockCompletionApi,
) {
  return render(
    <BlockCompletionContext value={api}>
      <SetLoggingContext value={setLogging}>
        <CircuitBlock block={block} storage={storage} now={now} />
      </SetLoggingContext>
    </BlockCompletionContext>,
  )
}

/** The movement the card says is live, by its `aria-current` step. */
function currentMovement(): string {
  return screen.getByRole('listitem', { current: 'step' }).textContent ?? ''
}

beforeEach(() => {
  clock = START
})

afterEach(() => {
  vi.useRealTimers()
})

describe('what the circuit reads from the block', () => {
  it('states the rounds and the shared rest the block prescribes', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(screen.getByText('CIRCUIT · 3 ROUNDS')).toBeInTheDocument()
    expect(screen.getByText('Round 1 of 3 · Movement 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('60s rest between rounds')).toBeInTheDocument()
  })

  it('never says a rest the block does not prescribe', () => {
    renderCircuit(
      circuitBlock({ roundRestSeconds: 0 }),
      fakeStorage(),
      completionDouble().api,
    )

    expect(screen.queryByText(/rest between rounds/i)).not.toBeInTheDocument()
  })

  it('numbers the movements and labels the round they belong to', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(screen.getByText('Each round:')).toBeInTheDocument()
    const movements = within(
      screen.getByRole('list', { name: 'Movements in this circuit' }),
    ).getAllByRole('listitem')

    expect(movements).toHaveLength(3)
    expect(movements[0]?.textContent).toContain('1. back squat')
    expect(movements[2]?.textContent).toContain('3. back squat')
  })

  it('says so when every movement in it was swapped out', () => {
    renderCircuit(circuitBlock({ exercises: [] }), fakeStorage(), completionDouble().api)

    expect(screen.getByText(/every movement in it was swapped out/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next movement/i })).not.toBeInTheDocument()
  })
})

describe('advancing', () => {
  it('moves one movement per tap, and the round in one tap from the last', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(currentMovement()).toContain('1. back squat')

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    expect(screen.getByText('Round 1 of 3 · Movement 2 of 3')).toBeInTheDocument()
    expect(currentMovement()).toContain('2. back squat')

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    expect(screen.getByText('Round 1 of 3 · Movement 3 of 3')).toBeInTheDocument()

    // One tap ends the round and starts the next one — there is no second
    // control to find.
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))
    expect(screen.getByText('Round 2 of 3 · Rest')).toBeInTheDocument()
  })

  it('records the block as complete when the last round is finished', async () => {
    const user = userEvent.setup()
    renderCircuit(
      circuitBlock({ rounds: 1, roundRestSeconds: 0, exercises: ['not_started'] }),
      fakeStorage(),
      completionDouble().api,
    )

    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))

    expect(screen.getByText('Round 1 of 1 · Complete')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /finish round/i })).not.toBeInTheDocument()
    expect(screen.getByText(/every prescribed round is done/i)).toBeInTheDocument()
  })
})

describe('the shared rest', () => {
  it('runs once at the round boundary, not once per exercise', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    // Through the first two movements: no rest either time.
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()

    // The round boundary is the one place it appears, counting the block's own
    // sixty seconds down.
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('01:00')
    expect(screen.getByText('Rest between rounds')).toBeInTheDocument()
  })

  it('ends on its own when the block’s seconds have passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderCircuit(circuitBlock({ roundRestSeconds: 30 }), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))

    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:30')

    clock = START + 30_000
    await vi.advanceTimersByTimeAsync(1000)

    // No tap ended it: the clock did, and round two is under way.
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByText('Round 2 of 3 · Movement 1 of 3')).toBeInTheDocument()
  })

  it('can be ended early, and the round starts from the same place', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))
    await user.click(screen.getByRole('button', { name: 'Start round 2' }))

    expect(screen.getByText('Round 2 of 3 · Movement 1 of 3')).toBeInTheDocument()
    expect(currentMovement()).toContain('1. back squat')
  })
})

describe('surviving a refresh', () => {
  it('comes back to the round and the movement the user was on', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = circuitBlock()
    const first = renderCircuit(block, storage, completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))
    await user.click(screen.getByRole('button', { name: 'Start round 2' }))
    await user.click(screen.getByRole('button', { name: 'Next movement' }))

    expect(readCircuitState(storage, block.blockId)).toEqual({
      round: 2,
      position: 2,
      restStartedAt: null,
    })

    // The refresh: the tree is gone, the storage is not.
    first.unmount()
    renderCircuit(block, storage, completionDouble().api)

    expect(screen.getByText('Round 2 of 3 · Movement 2 of 3')).toBeInTheDocument()
    expect(currentMovement()).toContain('2. back squat')
  })

  it('comes back into the rest it was in, with the time that is left', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = circuitBlock()
    const first = renderCircuit(block, storage, completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))

    first.unmount()
    clock = START + 20_000
    renderCircuit(block, storage, completionDouble().api)

    // Forty of the sixty seconds are left: the rest was measured from when it
    // started, not from when the page came back.
    expect(screen.getByRole('timer', { name: 'Time remaining' })).toHaveTextContent('00:40')
  })

  it('starts from the top when the stored record cannot be used', () => {
    const storage = fakeStorage()
    storage.setItem(WORKOUT_CIRCUIT_STORAGE_KEY, 'not json')

    renderCircuit(circuitBlock(), storage, completionDouble().api)

    expect(screen.getByText('Round 1 of 3 · Movement 1 of 3')).toBeInTheDocument()
  })

  it('puts the user at a position the block still has', async () => {
    const user = userEvent.setup()
    const storage = fakeStorage()
    const block = circuitBlock()
    const first = renderCircuit(block, storage, completionDouble().api)

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    first.unmount()

    // Two of the three movements were swapped out while the user was away.
    const shortened: BlockProgress = {
      ...block,
      exercises: block.exercises.slice(0, 1),
      exerciseCount: 1,
    }
    renderCircuit(shortened, storage, completionDouble().api)

    expect(screen.getByText('Round 1 of 3 · Movement 1 of 1')).toBeInTheDocument()
  })
})

describe('what it supplies to the shell', () => {
  it('completes with the rounds it actually got through', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    const block = circuitBlock()
    renderCircuit(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))
    await user.click(screen.getByRole('button', { name: 'Start round 2' }))

    await user.click(screen.getByRole('button', { name: 'Complete circuit' }))

    // One round is behind them and one is in progress: a round in progress is
    // not a round completed.
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      roundsCompleted: 1,
    })
  })

  it('supplies zero rounds rather than nothing when none were finished', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    const block = circuitBlock()
    renderCircuit(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Complete circuit' }))

    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {
      roundsCompleted: 0,
    })
  })

  it('supplies no count at all for a circuit with nothing to perform', async () => {
    const user = userEvent.setup()
    const { api, completeBlock } = completionDouble()
    const block = circuitBlock({ exercises: [] })
    renderCircuit(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Complete circuit' }))

    // Zero rounds of nothing is not an observation (DATA_MODEL §8).
    expect(completeBlock).toHaveBeenCalledExactlyOnceWith(block.blockId, {})
  })
})
