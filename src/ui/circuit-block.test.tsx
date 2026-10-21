/**
 * EXE-03 acceptance, as the user meets it:
 *
 *   · the rounds and the shared rest come from `workout_blocks`;
 *   · the round and the position within it advance in one tap, and survive a
 *     refresh — here, a remount against the same storage;
 *   · the shared rest is taken once per round rather than once per exercise;
 *   · completion supplies `rounds_completed` to the shell.
 *
 * And the 0.14.3 composition of the same block (REQ-023): it draws with the
 * shared `BlockPanel` frame — one card, the movements as rows of one list, the
 * rest countdown beside the card rather than inside it, current element-frame
 * fields and exactly one completion — while each movement's sets still save,
 * refuse and retry through the shell's one path, independent of the round.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import { createError, err, ErrorCode } from '../state/errors'
import {
  SetLoggingContext,
  type SetLogEntry,
  type SetLoggingApi,
} from '../state/set-logging'
import { SetLoggingProvider } from '../state/set-logging-provider'
import type { BlockProgress } from '../state/workout-progress'
import { sessionProgress } from '../state/workout-progress'
import {
  readCircuitState,
  WORKOUT_CIRCUIT_STORAGE_KEY,
  type ShellStorage,
} from '../state/workout-persistence'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type BlockFixture,
  type WorkoutDouble,
} from '../test/workout-double'
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
  const reportOutcome = vi.fn<(blockId: string, outcome: BlockOutcome) => void>()
  const api: BlockCompletionApi = { reportOutcome, isBlockRecorded: () => false }
  return { api, reportOutcome }
}

/** EXE-02's seam, stubbed: this test is about rounds, not about sets. */
const setLogging: SetLoggingApi = {
  logSet: vi.fn(),
  loggedSets: () => [],
  isSaving: () => false,
  weightUnit: 'kg',
  sync: { unsyncedCount: 0, sustainedFailure: false, syncing: false },
  retrySync: vi.fn(),
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

/** Every card frame in the document, and the ones that sit inside another. */
function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.clr-card'))
}

function nestedCards(): HTMLElement[] {
  return cards().filter((card) => card.parentElement?.closest('.clr-card') != null)
}

function movementList(): HTMLElement {
  return screen.getByRole('list', { name: 'Movements in this circuit' })
}

/** The circuit's rows, in the order the list lays them out. */
function movementRows(): HTMLElement[] {
  return Array.from(movementList().children) as HTMLElement[]
}

/** The block's own card: the one the movement list is drawn in. */
function blockCard(): HTMLElement {
  const card = movementList().closest<HTMLElement>('.clr-card')
  if (card === null) throw new Error('the movement list is in no card')
  return card
}

/** One movement's set form, so two movements' fields never collide. */
function formFor(name: string, setNumber = 1) {
  return within(screen.getByRole('form', { name: `Log set ${setNumber} of ${name}` }))
}

/** Through round one and into the rest that follows it. */
async function reachRest(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next movement' }))
  await user.click(screen.getByRole('button', { name: 'Next movement' }))
  await user.click(screen.getByRole('button', { name: 'Finish round 1' }))
}

/** The nth set id minted: no two sets share one. */
function mintedId(index: number): string {
  return `a000000${index + 1}-0000-4000-8000-000000000000`
}

/** No pass the test did not ask for: a retry here is something the user did. */
const NO_AUTOMATIC_RETRY = () => 1_000_000

interface Logging {
  workout: WorkoutDouble
  block: BlockProgress
  /** Every write the transport was asked for, refused or not, in order. */
  attempts: SetLogEntry[]
  storage: ShellStorage
}

/**
 * The circuit under the shell's real set-logging provider: two movements with
 * names of their own, so a set can be followed to the row it was written for.
 */
function renderLoggingCircuit(
  options: {
    /** Whether to refuse a write as offline. */
    refuse?: () => boolean
    /** Hold every write unanswered until this settles. */
    held?: Promise<void>
  } = {},
): Logging {
  const snapshot = snapshotFixture({
    sections: [
      {
        blocks: [
          {
            structureType: 'circuit',
            rounds: 3,
            roundRestSeconds: 60,
            exercises: [
              { prescription: { exercise_id: 'back-squat', order_index: 0 } },
              { prescription: { exercise_id: 'romanian-deadlift', order_index: 1 } },
            ],
          },
        ],
      },
    ],
  })
  const base = createWorkoutDouble({ session: snapshot })
  const attempts: SetLogEntry[] = []
  const workout: WorkoutDouble = {
    ...base,
    clients: {
      ...base.clients,
      setLogs: {
        async log(entry) {
          attempts.push(entry)
          await options.held
          return options.refuse?.()
            ? err(createError(ErrorCode.NETWORK_OFFLINE))
            : base.clients.setLogs.log(entry)
        },
      },
    },
  }
  const block = sessionProgress(snapshot).sections[0]!.blocks[0]!
  const storage = fakeStorage()
  let minted = 0

  render(
    <AppProviders workout={workout.clients}>
      <BlockCompletionContext value={completionDouble().api}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={block.exercises}
          weightUnit="kg"
          onFailure={vi.fn()}
          newId={() => mintedId(minted++)}
          retryDelay={NO_AUTOMATIC_RETRY}
        >
          <CircuitBlock block={block} storage={storage} now={now} />
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>,
  )

  return { workout, block, attempts, storage }
}

/** Logs one set of a movement through its own form: 60 kg for 8. */
async function logSet(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  setNumber: number,
) {
  const form = formFor(name, setNumber)
  const weight = form.getByLabelText('Weight (kg)')
  const reps = form.getByLabelText('Reps')
  await user.clear(weight)
  await user.type(weight, '60')
  await user.clear(reps)
  await user.type(reps, '8')
  await user.click(form.getByRole('button', { name: `Log set ${setNumber}` }))
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

  it('advances and persists on the first tap after expired rest, including a remount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    for (const restoreAfterExpiry of [false, true]) {
      clock = START
      const storage = fakeStorage()
      const block = circuitBlock({ roundRestSeconds: 30 })
      let mounted = renderCircuit(block, storage, completionDouble().api)

      await user.click(screen.getByRole('button', { name: 'Next movement' }))
      await user.click(screen.getByRole('button', { name: 'Next movement' }))
      await user.click(screen.getByRole('button', { name: 'Finish round 1' }))

      if (restoreAfterExpiry) mounted.unmount()
      clock = START + 30_000
      if (restoreAfterExpiry) {
        mounted = renderCircuit(block, storage, completionDouble().api)
      } else {
        await vi.advanceTimersByTimeAsync(1000)
      }

      expect(screen.queryByRole('timer')).not.toBeInTheDocument()
      expect(screen.getByText('Round 2 of 3 · Movement 1 of 3')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Next movement' }))

      expect(screen.getByText('Round 2 of 3 · Movement 2 of 3')).toBeInTheDocument()
      expect(readCircuitState(storage, block.blockId)).toEqual({
        round: 2,
        position: 2,
        restStartedAt: null,
      })

      mounted.unmount()
      const restored = renderCircuit(block, storage, completionDouble().api)
      expect(screen.getByText('Round 2 of 3 · Movement 2 of 3')).toBeInTheDocument()
      restored.unmount()
    }
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
  it('reports the rounds it actually got through', async () => {
    const user = userEvent.setup()
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock()
    renderCircuit(block, fakeStorage(), api)

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))
    await user.click(screen.getByRole('button', { name: 'Start round 2' }))

    // One round is behind them and one is in progress: a round in progress is
    // not a round completed.
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, { roundsCompleted: 1 })
  })

  it('reports no count when no round boundary was recorded', () => {
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock()
    renderCircuit(block, fakeStorage(), api)

    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('reports no count at all for a circuit with nothing to perform', () => {
    const { api, reportOutcome } = completionDouble()
    const block = circuitBlock({ exercises: [] })
    renderCircuit(block, fakeStorage(), api)

    // Zero rounds of nothing is not an observation (DATA_MODEL §8).
    expect(reportOutcome).toHaveBeenLastCalledWith(block.blockId, {})
  })

  it('offers no completion of its own: the section’s forward action saves it (REQ-013)', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(screen.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
  })
})

describe('the circuit draws with the shared block frame', () => {
  it('is one card, with the movements as rows of one list and never a card inside it', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    expect(cards()).toHaveLength(1)
    expect(nestedCards()).toEqual([])

    const rows = movementRows()
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.tagName).toBe('LI')
      expect(row.closest('.clr-card')).toBe(cards()[0])
      expect(row.querySelector('.clr-card')).toBeNull()
    }
  })

  it('carries the identity row, the position and the rest line inside the card', () => {
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    const inside = within(blockCard())
    expect(inside.getByText('CIRCUIT · 3 ROUNDS')).toBeInTheDocument()
    expect(inside.getByText('3 movements')).toBeInTheDocument()
    expect(inside.getByText('Round 1 of 3 · Movement 1 of 3')).toBeInTheDocument()
    expect(inside.getByText('Each round:')).toBeInTheDocument()
    expect(inside.getByText('60s rest between rounds')).toBeInTheDocument()
  })

  it('marks the live movement with a word and aria-current, and no other row', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    const marked = () =>
      movementRows().map((row) => [
        row.getAttribute('aria-current'),
        within(row).queryByText('Now') !== null,
      ])

    expect(marked()).toEqual([
      ['step', true],
      [null, false],
      [null, false],
    ])

    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    expect(marked()).toEqual([
      [null, false],
      ['step', true],
      [null, false],
    ])
  })

  it('draws the rest countdown beside the card and its one control inside it', async () => {
    const user = userEvent.setup()
    renderCircuit(circuitBlock(), fakeStorage(), completionDouble().api)

    await reachRest(user)

    // The shipped timer is its own frame: a sibling of the block's card.
    const timer = screen.getByRole('timer', { name: 'Time remaining' })
    expect(blockCard().contains(timer)).toBe(false)
    expect(nestedCards()).toEqual([])
    expect(cards()).toHaveLength(2)

    const inside = within(blockCard())
    expect(inside.getByText('Rest between rounds')).toBeInTheDocument()
    expect(inside.getAllByRole('button', { name: 'Start round 2' })).toHaveLength(1)
    // The forward control is the rest's own while it runs — never two.
    expect(screen.queryByRole('button', { name: /next movement|finish round/i })).toBeNull()

    // Resting, nobody is told to start: the opener is `Next`, not current.
    const [opener, ...others] = movementRows()
    expect(within(opener!).getByText('Next')).toBeInTheDocument()
    expect(opener).not.toHaveAttribute('aria-current')
    for (const row of others) expect(within(row).queryByText(/^(Now|Next)$/)).toBeNull()

    await user.click(inside.getByRole('button', { name: 'Start round 2' }))
    expect(cards()).toHaveLength(1)
  })

  it('marks no movement and offers no forward control once every round is done', async () => {
    const user = userEvent.setup()
    renderCircuit(
      circuitBlock({ rounds: 1, roundRestSeconds: 0, exercises: ['not_started'] }),
      fakeStorage(),
      completionDouble().api,
    )

    await user.click(screen.getByRole('button', { name: 'Finish round 1' }))

    const [row] = movementRows()
    expect(row).not.toHaveAttribute('aria-current')
    expect(within(row!).queryByText(/^(Now|Next)$/)).toBeNull()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(
      within(blockCard()).queryByRole('button', {
        name: /next movement|finish round|start round|^complete/i,
      }),
    ).toBeNull()
  })

  it('is still one card when nothing is left to perform', () => {
    renderCircuit(circuitBlock({ exercises: [] }), fakeStorage(), completionDouble().api)

    expect(cards()).toHaveLength(1)
    expect(screen.queryByRole('list', { name: 'Movements in this circuit' })).toBeNull()
    expect(screen.queryByText('Each round:')).not.toBeInTheDocument()
  })

  it('sets each movement’s fields in one wrapping row of current element frames', () => {
    renderLoggingCircuit()

    for (const name of ['back squat', 'romanian deadlift']) {
      const form = formFor(name)
      const row = form.getByLabelText('Weight (kg)').closest('.clr-row')
      expect(row).not.toBeNull()
      // The row adds no frame: the fields are the only chamfers in it.
      expect(row).not.toHaveClass('clr-chamfer')

      for (const label of ['Weight (kg)', 'Reps', 'RPE']) {
        const field = form.getByLabelText(label)
        expect(field).toHaveClass('clr-input')
        expect(field.closest('.clr-row')).toBe(row)
        expect(field.closest('.clr-field')).not.toBeNull()
      }
    }
  })

  it('gives each movement its own log action, apart from the round action', () => {
    renderLoggingCircuit()

    for (const row of movementRows()) {
      expect(within(row).getAllByRole('button', { name: 'Log set 1' })).toHaveLength(1)
    }
    const action = screen.getByRole('button', { name: 'Next movement' })
    expect(action.closest('li')).toBeNull()
    expect(action.closest('.clr-card')).toBe(blockCard())
    expect(action).toBeEnabled()
  })
})

describe('logging a set inside a circuit', () => {
  it('writes the set against its movement and block, and leaves the round where it was', async () => {
    const user = userEvent.setup()
    const { workout, block, storage } = renderLoggingCircuit()

    await logSet(user, 'back squat', 1)

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))
    expect(workout.loggedSets()[0]).toMatchObject({
      exerciseId: block.exercises[0]!.exerciseId,
      blockId: block.blockId,
    })
    expect(
      await screen.findByRole('form', { name: 'Log set 2 of back squat' }),
    ).toBeInTheDocument()
    expect(formFor('romanian deadlift').getByRole('button', { name: 'Log set 1' })).toBeEnabled()

    // A set is not a tap on the round: the position moved nowhere, and no
    // rest was raised for it.
    expect(screen.getByText('Round 1 of 3 · Movement 1 of 2')).toBeInTheDocument()
    expect(readCircuitState(storage, block.blockId)).toBeNull()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('holds only the saving movement’s action busy while its set is in flight', async () => {
    const user = userEvent.setup()
    let release: (() => void) | null = null
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { workout, attempts } = renderLoggingCircuit({ held })

    await logSet(user, 'back squat', 1)

    await screen.findByRole('form', { name: 'Log set 2 of back squat' })
    const busy = formFor('back squat', 2).getByRole('button')
    await waitFor(() => expect(busy).toBeDisabled())
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(within(movementRows()[0]!).getByText('Saving')).toBeInTheDocument()

    // The other movement and the round stay the user's to press.
    expect(formFor('romanian deadlift').getByRole('button', { name: 'Log set 1' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next movement' })).toBeEnabled()

    await user.click(busy)
    expect(attempts).toHaveLength(1)

    await act(async () => {
      release?.()
      await held
    })

    await waitFor(() =>
      expect(within(movementRows()[0]!).getByText('Saved')).toBeInTheDocument(),
    )
    expect(workout.loggedSets()).toHaveLength(1)
  })

  it('keeps a refused set as unsaved while the round moves on, and resends it under the same id', async () => {
    const user = userEvent.setup()
    let online = false
    const { workout, attempts, block, storage } = renderLoggingCircuit({
      refuse: () => !online,
    })

    await logSet(user, 'back squat', 1)

    const first = within(movementRows()[0]!)
    expect(await first.findByText('On this device only')).toBeInTheDocument()
    expect(first.queryByText('Saved')).not.toBeInTheDocument()
    expect(workout.loggedSets()).toEqual([])

    // Offline does not hold the circuit: the round still advances and persists.
    await user.click(screen.getByRole('button', { name: 'Next movement' }))
    expect(screen.getByText('Round 1 of 3 · Movement 2 of 2')).toBeInTheDocument()
    expect(readCircuitState(storage, block.blockId)).toEqual({
      round: 1,
      position: 2,
      restStartedAt: null,
    })

    online = true
    await logSet(user, 'romanian deadlift', 1)

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(2))
    expect(attempts.filter((entry) => entry.id === mintedId(0))).toHaveLength(2)
    await waitFor(() =>
      expect(first.queryByText('On this device only')).not.toBeInTheDocument(),
    )
    expect(first.getByText('Saved')).toBeInTheDocument()
  })
})
